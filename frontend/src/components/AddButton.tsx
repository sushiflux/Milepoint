interface Props {
  onClick: () => void
  label: string
  icon?: React.ReactNode
}

export default function AddButton({ onClick, label, icon }: Props) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-medium leading-none text-white hover:bg-indigo-500"
    >
      {icon ?? '+'}
    </button>
  )
}
