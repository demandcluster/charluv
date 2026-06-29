import { RotateCcw, X } from '/web/icons'
import { Component } from 'solid-js'
import { AppSchema } from '../../../common/types/schema'
import { CharacterAvatar } from '../../shared/AvatarIcon'
import Button from '../../shared/Button'
import Modal from '../../shared/Modal'
import { characterStore } from '../../store'

const ResetCharacterModal: Component<{
  char?: AppSchema.Character
  show: boolean
  close: () => void
}> = (props) => {
  const onReset = () => {
    if (!props.char) return
    characterStore.resetCharacter(props.char._id, props.close)
  }

  return (
    <Modal
      show={props.show && !!props.char}
      title="Reset Character"
      close={props.close}
      footer={
        <>
          <Button schema="secondary" onClick={props.close}>
            <X />
            Cancel
          </Button>
          <Button schema="red" onClick={onReset}>
            <RotateCcw /> Reset
          </Button>
        </>
      }
    >
      <div class="flex flex-col items-center gap-4">
        <div class="font-bold text-[var(--red-500)]">
          This permanently deletes everything for this character.
        </div>
        <div class="text-center">
          All chats, the relationship progress (XP), and every saved memory will be erased. The
          character itself is kept. This cannot be undone.
        </div>
        <div class="flex items-center justify-center gap-4">
          <CharacterAvatar char={props.char!} format={{ size: 'md', corners: 'circle' }} />
          {props.char!.name}
        </div>
      </div>
    </Modal>
  )
}

export default ResetCharacterModal
