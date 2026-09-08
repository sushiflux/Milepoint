interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
}

// Standing on/off toggle for the project - no prior instance of this control existed elsewhere,
// so this establishes the pattern: clear red/green distinction (not two shades of neutral), so it
// stays easy to read at a glance. Reuse this component for any future on/off switch rather than
// styling a new one from scratch.
export default function ToggleSwitch({ checked, onChange, disabled, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? 'bg-emerald-600' : 'bg-red-500'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-1'
        }`}
      />
    </button>
  )
}
