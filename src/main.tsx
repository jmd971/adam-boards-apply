import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { DepotPublic } from '@/modules/depot/DepotPublic'

const root = createRoot(document.getElementById('root')!)
const token = new URLSearchParams(window.location.search).get('token')

root.render(
  <StrictMode>
    {token ? <DepotPublic token={token} /> : <App />}
  </StrictMode>
)
