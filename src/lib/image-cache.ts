/**
 * 会话级图片加载记录：记住本次运行内已成功加载过的图片 URL。
 *
 * SPA 路由来回切换会反复卸载/挂载图片组件，组件本身没有记忆，
 * 每次挂载都从骨架态重新开始，于是命中缓存的图片仍会播一次淡入。
 * 这里用一个内存集合把「已加载过」的事实留下来，让重新挂载时直接以完成态渲染。
 */
const loadedSources = new Set<string>()

/** 该 URL 在本次会话内是否已成功加载过 */
export function isImageLoaded(src: string | null | undefined): boolean {
  return Boolean(src) && loadedSources.has(src as string)
}

/** 登记一张已成功加载的图片（onLoad 或挂载时发现已完成时调用） */
export function markImageLoaded(src: string | null | undefined): void {
  if (src) {
    loadedSources.add(src)
  }
}
