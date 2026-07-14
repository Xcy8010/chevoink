import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { appRoutes } from '@/app/route-config'
import AppShell from '@/components/layout/AppShell'

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {appRoutes.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={
              route.useShell === false ? (
                route.element
              ) : (
                <AppShell title={route.title} description={route.description}>
                  {route.element}
                </AppShell>
              )
            }
          />
        ))}
      </Routes>
    </BrowserRouter>
  )
}
