import AppProviders from '@/app/AppProviders'
import AppRouter from '@/app/AppRouter'

export default function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  )
}
