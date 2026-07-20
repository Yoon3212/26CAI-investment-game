import './Marquee.css'

interface MarqueeProps {
  text: string
}

export default function Marquee({ text }: MarqueeProps) {
  return (
    <div className="pp-marquee">
      <div className="pp-marquee-track">
        <span>{text}</span>
        <span>{text}</span>
      </div>
    </div>
  )
}
