import React from 'react'
import {createRoot} from 'react-dom/client'
import {installWebApi} from './api'
import App from '../renderer/App'
import '../renderer/styles.css'
installWebApi()
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
