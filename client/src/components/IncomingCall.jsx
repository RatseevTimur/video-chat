import { BsCameraVideo } from 'react-icons/bs'
import { FiPhoneOff } from 'react-icons/fi'

const IncomingCall = ({ fromName, onAccept, onReject }) => (
  <div className="incoming-call">
    <div className="incoming-card">
      <p className="incoming-label">Входящий звонок / Incoming call</p>
      <h2>{fromName}</h2>
      <div className="incoming-actions">
        <button type="button" className="btn btn-success" onClick={onAccept}>
          <BsCameraVideo /> Принять / Accept
        </button>
        <button type="button" className="btn btn-danger" onClick={onReject}>
          <FiPhoneOff /> Отклонить / Decline
        </button>
      </div>
    </div>
  </div>
)

export default IncomingCall
