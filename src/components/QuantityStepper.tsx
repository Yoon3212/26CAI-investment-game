import './QuantityStepper.css'

interface QuantityStepperProps {
  value: number
  onChange: (next: number) => void
  disabled?: boolean
  min?: number
  max: number
}

export default function QuantityStepper({ value, onChange, disabled, min = 1, max }: QuantityStepperProps) {
  const canBuyAny = max >= min
  const clampedMax = Math.max(max, min)
  const safeValue = Number.isFinite(value) ? Math.min(Math.max(value, min), clampedMax) : min

  function handleTextChange(raw: string) {
    const digitsOnly = raw.replace(/[^0-9]/g, '')
    if (digitsOnly === '') {
      onChange(min)
      return
    }
    onChange(Math.min(Math.max(Number(digitsOnly), min), clampedMax))
  }

  const isDisabled = disabled || !canBuyAny

  return (
    <div className="qty-stepper">
      <button
        type="button"
        className="qty-stepper-btn"
        onClick={() => onChange(Math.max(min, safeValue - 1))}
        disabled={isDisabled || safeValue <= min}
        aria-label="수량 줄이기"
      >
        −
      </button>
      <input
        className="qty-stepper-input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={safeValue}
        onChange={(e) => handleTextChange(e.target.value)}
        disabled={isDisabled}
      />
      <button
        type="button"
        className="qty-stepper-btn"
        onClick={() => onChange(Math.min(clampedMax, safeValue + 1))}
        disabled={isDisabled || safeValue >= clampedMax}
        aria-label="수량 늘리기"
      >
        +
      </button>
      <button
        type="button"
        className="qty-stepper-max"
        onClick={() => onChange(clampedMax)}
        disabled={isDisabled}
      >
        MAX
      </button>
    </div>
  )
}
