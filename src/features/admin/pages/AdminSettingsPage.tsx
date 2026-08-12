import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'

import Button from '@/components/ui/Button'
import TextInput from '@/components/ui/TextInput'
import { useToast } from '@/components/ui/Toast'
import { ApiClientError } from '@/app/api-client'
import { adminChangeMyPassword, adminLogout } from '../api'
import { AdminCard, AdminPageHeader } from '../AdminLayout'

export default function AdminSettingsPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const mutation = useMutation({
    mutationFn: () => adminChangeMyPassword(oldPassword, newPassword),
    onSuccess: async () => {
      toast.success('密码已修改，请使用新密码重新登录')
      // 改密后旧会话 token 仍有效（无状态会话），登出强制重新登录
      await adminLogout().catch(() => {})
      navigate('/admin/login', { replace: true })
    },
    onError: (error) => toast.error(error instanceof ApiClientError ? error.message : '修改失败'),
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (mutation.isPending) return

    if (!oldPassword || !newPassword) {
      toast.error('请输入旧密码和新密码。')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('两次输入的新密码不一致。')
      return
    }
    if (newPassword.length < 12) {
      toast.error('新密码至少 12 位。')
      return
    }
    if (!/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      toast.error('新密码需包含大写字母、小写字母、数字和特殊符号。')
      return
    }

    mutation.mutate()
  }

  return (
    <div>
      <AdminPageHeader title="安全设置" description="管理你的登录凭证" />

      <AdminCard className="max-w-lg">
        <h2 className="mb-1 text-sm font-semibold">修改登录密码</h2>
        <p className="mb-4 text-xs text-[var(--text-secondary)]">
          修改成功后当前会话将退出，需使用新密码重新登录。
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm text-[var(--text-secondary)]">当前密码</p>
            <TextInput
              type="password"
              autoComplete="current-password"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm text-[var(--text-secondary)]">新密码</p>
            <TextInput
              type="password"
              autoComplete="new-password"
              placeholder="至少 12 位，含大小写、数字与符号"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm text-[var(--text-secondary)]">确认新密码</p>
            <TextInput
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>

          <Button type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? '提交中…' : '修改密码'}
          </Button>
        </form>
      </AdminCard>
    </div>
  )
}
