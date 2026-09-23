import { MASKS } from '../utils/masks'

const MaskPicker = ({ value, onChange, disabled }) => (
  <div className="mask-picker">
    {MASKS.map((mask) => (
      <button
        key={mask.id}
        type="button"
        className={value === mask.id ? 'active' : ''}
        disabled={disabled}
        onClick={() => onChange(mask.id)}
      >
        {mask.name}
      </button>
    ))}
  </div>
)

export default MaskPicker
