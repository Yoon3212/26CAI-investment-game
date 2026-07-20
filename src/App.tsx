import { Routes, Route } from 'react-router-dom'
import ParticipantPage from './routes/ParticipantPage'
import HostPage from './routes/HostPage'
import DisplayPage from './routes/DisplayPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ParticipantPage />} />
      <Route path="/host" element={<HostPage />} />
      <Route path="/display" element={<DisplayPage />} />
    </Routes>
  )
}
