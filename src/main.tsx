import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/index.css'
import App from './App'

// Após uma nova publicação, arquivos da versão anterior deixam de existir. Se o navegador
// ainda tiver a versão antiga e falhar ao carregar um módulo, recarrega uma vez na versão nova.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  const key = 'opinex.reloaded-after-update'
  try {
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
  } catch { /* armazenamento indisponível */ }
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
