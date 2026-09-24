import { MASKS } from '../utils/masks'

const MaskPicker = ({ value, onChange, disabled }) => (
  <label className="mask-select">
    <span className="sr-only">Маска</span>
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {MASKS.map((mask) => (
        <option key={mask.id} value={mask.id}>
          {mask.name}
        </option>
      ))}
    </select>
  </label>
)

export default MaskPicker
