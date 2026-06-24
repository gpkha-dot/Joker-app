import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './i18n/index.js'
import HomeScreen from './screens/HomeScreen'
import CreateRoomScreen from './screens/CreateRoomScreen'
import JoinRoomScreen from './screens/JoinRoomScreen'
import WaitingRoomScreen from './screens/WaitingRoomScreen'
import ScoresheetScreen from './screens/ScoresheetScreen'
import ResultsScreen from './screens/ResultsScreen'

export default function App() {
  return (
    <BrowserRouter basename="/Joker-app">
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/create" element={<CreateRoomScreen />} />
        <Route path="/join" element={<JoinRoomScreen />} />
        <Route path="/room/:code/waiting" element={<WaitingRoomScreen />} />
        <Route path="/room/:code/game" element={<ScoresheetScreen />} />
        <Route path="/room/:code/results" element={<ResultsScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
