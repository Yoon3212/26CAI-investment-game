export default function BrandBar() {
  return (
    <div className="pp-brandbar">
      <img className="pp-mark" src="/favicon.png" alt="" draggable={false} onContextMenu={(e) => e.preventDefault()} />
      <span className="pp-word">
        CAI <b>거래소</b>
      </span>
    </div>
  )
}
