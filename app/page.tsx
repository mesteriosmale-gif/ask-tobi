import App from '../src/App'
import { googleSignInEnabled } from '../auth'

export default function HomePage() {
  return <App googleSignInEnabled={googleSignInEnabled} />
}
