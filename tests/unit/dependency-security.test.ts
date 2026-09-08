import { createRequire } from 'node:module'
import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
// Resolve the dependencies actually consumed by the production parents.
const expressRequire = createRequire(require.resolve('express'))
const mammothRequire = createRequire(require.resolve('mammoth'))
const qs = expressRequire('qs') as typeof import('qs')
const { DOMImplementation, XMLSerializer } = mammothRequire('@xmldom/xmldom') as typeof import('@xmldom/xmldom')
// xmldom exposes this legacy DOM API at runtime; lib.dom no longer declares it.
const createDocument = () => new DOMImplementation().createDocument(null, 'root', null) as XMLDocument & {
  createEntityReference(name: string): Node
}

describe('production dependency security regressions', () => {
  it('serializes untrusted query objects without calling attacker-controlled isBuffer', () => {
    const parsed = qs.parse('item[constructor][isBuffer]=not-a-function', { plainObjects: true })
    expect(() => qs.stringify(parsed)).not.toThrow()
  })

  it('rejects invalid XML entity names at creation', () => {
    const doc = createDocument()
    expect(() => doc.createEntityReference('safe; <injected/> &tail')).toThrow()
  })

  it('rejects a mutated entity name during strict serialization', () => {
    const ref = createDocument().createEntityReference('valid')
    Object.defineProperty(ref, 'nodeName', { value: 'safe; <injected/> &tail' })
    expect(() => new XMLSerializer().serializeToString(ref, false, undefined, { requireWellFormed: true })).toThrow()
  })

  it('retains ordinary nested query and form parsing through Express', async () => {
    const app = express()
    app.use(express.urlencoded({ extended: true, limit: '40mb' }))
    app.get('/query', (req, res) => res.json(req.query))
    app.post('/form', (req, res) => res.json(req.body))
    const expected = { filter: { title: '布衣山河' }, tags: ['one', 'two'] }
    const encoded = 'filter[title]=%E5%B8%83%E8%A1%A3%E5%B1%B1%E6%B2%B3&tags[]=one&tags[]=two'
    expect((await request(app).get(`/query?${encoded}`).expect(200)).body).toEqual(expected)
    expect((await request(app).post('/form').type('form').send(encoded).expect(200)).body).toEqual(expected)
  })

  it('preserves valid XML names and escaping', () => {
    const doc = createDocument()
    doc.documentElement!.appendChild(doc.createTextNode('A & B < C'))
    expect(new XMLSerializer().serializeToString(doc)).toBe('<root>A &amp; B &lt; C</root>')
    expect(new XMLSerializer().serializeToString(doc.createEntityReference('valid'))).toBe('&valid;')
  })
})
