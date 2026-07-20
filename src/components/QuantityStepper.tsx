import './QuantityStepper.css'

interface QuantityStepperProps {
  value: number
  onChange: (next: number) => void
  disabled?: boolean
  min?: number
}

export default function QuantityStepper({ value, onChange, disabled, min = 1 }: QuantityStepperProps) {
  const safeValue = Number.isFinite(value) && value >= min ? value : min

  return (
    <div className="qty-stepper">
      <button
        type="button"
        className="qty-stepper-btn"
        onClick={() => onChange(Math.max(min, safeValue - 1))}
        disabled={disabled || safeValue <= min}
        aria-label="수량 줄이기"
      >
        −
      </button>
      <span className="qty-stepper-value">{safeValue}</span>
      <button
        type="button"
        className="qty-stepper-btn"
        onClick={() => onChange(safeValue + 1)}
        disabled={disabled}
        aria-label="수량 늘리기"
      >
        +
      </button>
    </div>
  )
}
