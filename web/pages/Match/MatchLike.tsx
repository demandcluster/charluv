export const MatchLike: Component<{ character: AppSchema.Character; match: Any }> = (props) => {
  return (
    <div class="flex w-full  gap-2">
      <div class="bg-800 flex  w-full flex-row items-center justify-between gap-4 rounded-xl px-2 py-1 hover:bg-[var(--bg-700)]">
        <A
          class="ellipsis flex h-3/4 w-5/6 grow cursor-pointer items-center gap-4"
          href={`/likes/${props.character._id}/profile`}
        >
          <CharacterAvatar char={props.character} zoom={1.75} />
          <div class="flex h-[52px] max-w-full flex-col overflow-hidden">
            <span class="ellipsis font-bold">{props.character.name}</span>
            <span class="ellipsis">{props.character.description}</span>
          </div>
        </A>
        <div class="flex w-1/6 flex-row items-center justify-center gap-2">
          <Button
            class="ml-4 flex h-3/4 cursor-pointer items-center rounded-2xl sm:w-9/12"
            onClick={() => props.match(props.character._id)}
          >
            MATCH{' '}
            <Check class="hidden cursor-pointer text-xs text-white/25 hover:text-white sm:block sm:text-sm " />
          </Button>
        </div>
      </div>
    </div>
  )
}
