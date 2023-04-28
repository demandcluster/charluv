import { Component, createEffect, createSignal, For, Show } from 'solid-js'
import Button from '../../shared/Button'
import PageHeader from '../../shared/PageHeader'
import { Check, Delete, Heart, Undo2, X, AlignLeft } from 'lucide-solid'
import { AppSchema } from '../../../srv/db/schema'
import { A, useNavigate } from '@solidjs/router'
import AvatarIcon from '../../shared/AvatarIcon'
import { matchStore, userStore, swipeStore } from '../../store'

import { SwipeCard } from '../../shared/Swipe'
import type { SwipeCardRef } from '../../shared/Swipe'

import { getAssetUrl } from '../../shared/util'

const MatchList: Component = () => {
  const swipeCount = swipeStore()
  let curApiref
  let totalSwipes = []
  let tmpSwipes = []

  createEffect(() => {
    curApiref = ''
    totalSwipes = []
    tmpSwipes = []
    swipeStore.getSwipe()
    matchStore.getMatches(swipeCount.lastid)
  })

  const matchItems = matchStore((s) => s.characters)
  const [charsList, setCharList] = createSignal(matchItems)
  const [charsIds, setCharIds] = createSignal(matchItems)

  const showZindex = { min: 1000000, plus: 2000000 }
  const [undoDisabled, setUndo] = createSignal('disabled')
  const [colorSwipeMove, setSwipeMove] = createSignal({
    left: ' text-red-500 fill-red-500 ',
    right: ' text-emerald-400 fill-emerald-400',
    up: ' text-cyan-300 fill-cyan-300',
    down: ' text-orange-300 ',
  })

  const [showImport, setImport] = createSignal(false)
  const [showDelete, setDelete] = createSignal<AppSchema.Character>()
  const user = userStore()
  const navigate = useNavigate()

  const createMatch = async (charId: string) => {
    const char = charsList().list.find((c) => c._id === charId)
    matchStore.createMatch(char)
  }

  const SwipeDirection = 'right' | 'left'
  function swipeAction(direction) {
    // let swipeNowAmount = 0;
    if (direction === 'down') direction = 'left'
    switch (direction) {
      case 'right':
        createMatch(this.id)
        this.apiRef.remove()
        break
      case 'up':
        showProfile()
        break
    }
    if (direction === 'right' || direction === 'left') {
      swipeStore.setSwipe(charsIds().list[charsIds().list.length - 1]._id)
      if (direction === 'left') {
        const test = charsIds().list.splice(0, charsIds().list.length - 1)
        test.unshift(charsIds().list[charsIds().list.length - 1])
        setCharIds({ loaded: true, list: test })
        tmpSwipes[this.apiRef.id] = [...test]
        setTimeout(() => {
          if (tmpSwipes[this.apiRef.id] && !tmpSwipes[this.apiRef.id].deleted) {
            this.apiRef.restoreBack(5)
            setCharList({ loaded: true, list: tmpSwipes[this.apiRef.id] })
            tmpSwipes[this.apiRef.id].deleted = 1
          }
        }, 2500)
        setUndo('')
      } else {
        const test = charsIds().list.splice(0, charsIds().list.length - 1)
        setCharIds({ loaded: true, list: test })
        tmpSwipes[this.apiRef.id] = test
        setTimeout(() => {
          if (tmpSwipes[this.apiRef.id]) {
            setCharList({ loaded: true, list: tmpSwipes[this.apiRef.id] })
            tmpSwipes[this.apiRef.id].deleted = 1
            // delete tmpSwipes[this.apiRef.id];
          }
        }, 2500)
        setUndo('disabled')
      }
    }
  }

  function swipeMovement(a) {
    switch (a) {
      case 'left':
        setSwipeMove({
          left: 'bg-red-500 text-white scale-100',
          right: ' text-emerald-400 fill-emerald-400 scale-80',
          up: ' text-cyan-300 fill-cyan-300 scale-100',
          down: ' text-orange-300 ',
        })
        break
      case 'right':
        setSwipeMove({
          left: ' text-red-500 fill-red-800 scale-80',
          right: 'bg-emerald-400 text-white scale-100',
          up: ' text-cyan-300 fill-cyan-300 scale-100',
          down: ' text-orange-300 ',
        })
        break
      case 'up':
        setSwipeMove({
          left: ' text-red-500 fill-red-800',
          right: ' text-emerald-400 fill-emerald-400 scale-100',
          up: 'bg-cyan-400 text-white scale-100',
          down: ' text-orange-300 ',
        })
        break
      case 'down':
        setSwipeMove({
          left: 'bg-red-500 text-white scale-100',
          right: ' text-emerald-400 fill-emerald-400 scale-80',
          up: ' text-cyan-300 fill-cyan-300 scale-100',
          down: ' text-orange-300 ',
        })
        break
      case 'restore':
        setSwipeMove({
          left: ' text-red-500 fill-red-800',
          right: ' text-emerald-400 fill-emerald-400 scale-100',
          up: ' text-cyan-300 fill-cyan-300 scale-100',
          down: ' text-orange-300 ',
        })
        break
    }
  }
  function showProfile() {
    navigate(`/likes/${charsIds().list[charsIds().list.length - 1]._id}/profile`)
  }
  function SwipeUndo() {
    setUndo('disabled')
    totalSwipes[charsIds().list[0]._id].snapBack(6)
    const tmpChar = charsIds().list
    const firstElement = tmpChar.shift()
    tmpChar.push(firstElement)
    setCharIds({ loaded: true, list: tmpChar })
    tmpSwipes[charsIds().list[0]._id] = tmpChar
    swipeStore.setSwipe(charsIds().list[0]._id)
    Object.keys(tmpSwipes).forEach((key) => {
      if (
        tmpSwipes[key][tmpSwipes[key].length - 1]._id !==
        charsIds().list[charsIds().list.length - 1]._id
      ) {
        if (!tmpSwipes[key].deleted) {
          totalSwipes[key].restoreBack(5)
          setCharList({ loaded: true, list: tmpSwipes[key] })
        }
        delete tmpSwipes[key]
      } else {
        setTimeout(() => {
          setCharList({ loaded: true, list: tmpSwipes[key] })
          setCharIds({ loaded: true, list: tmpSwipes[key] })
          delete tmpSwipes[key]
        }, 200)
      }
    })
  }
  function buttonSwipe(direction) {
    totalSwipes[charsIds().list[charsIds().list.length - 1]._id].swipe(direction)
  }

  return (
    <>
      <PageHeader title="Likes" subtitle="" />
      <Show when={!charsList().loaded || !swipeCount.loaded}>
        <div>Loading ...</div>
      </Show>
      <Show when={charsList().loaded && swipeCount.loaded}>
        <div class="flex w-full flex-col gap-2 ">
          <For each={charsList().list}>
            {(char, i) => (
              <DSwipeCard
                character={char}
                match={createMatch}
                totalSwipes={totalSwipes}
                swipeAction={swipeAction}
                swipeMovement={swipeMovement}
                swipeCount={swipeCount}
                showZindex={i}
              />
            )}
          </For>
        </div>
        <div class=" m-[26em] mx-auto mb-4 w-96 max-w-5xl pl-6 pb-2 md:w-[26rem] md:pl-1 sm:mt-[36em]">
          <button
            onclick={() => buttonSwipe('left')}
            class={`${
              colorSwipeMove().left
            } " " mx-3 h-16 w-16 rounded-full border-2 border-solid border-red-500 p-2 font-bold text-white shadow-lg duration-200 md:h-20 md:w-20 md:hover:scale-125`}
          >
            <X size={40} class={`${colorSwipeMove().left} "  icon-button " inline-block`} />
          </button>
          <button
            onclick={() => showProfile()}
            class={`${
              colorSwipeMove().up
            } " " mx-3 h-14 w-14 rounded-full border-2 border-solid border-cyan-300 p-2 align-bottom font-bold text-white shadow-lg duration-200 disabled:opacity-10 md:h-16 md:w-16 md:hover:scale-125`}
          >
            <AlignLeft size={30} class={`${colorSwipeMove().up} " icon-button inline-block" w-6`} />
          </button>
          <button
            disabled={undoDisabled()}
            onclick={() => SwipeUndo()}
            class={`${
              colorSwipeMove().down
            } " " mx-3 h-14 w-14 rounded-full border-2 border-solid border-orange-300 p-2 align-bottom font-bold text-white shadow-lg duration-200 disabled:opacity-10 disabled:hover:scale-100 md:h-16 md:w-16 md:hover:scale-125`}
          >
            <Undo2 size={30} class={`${colorSwipeMove().down} " icon-button inline-block" w-6`} />
          </button>
          <button
            onclick={() => buttonSwipe('right')}
            class={`${
              colorSwipeMove().right
            } " " mx-3 h-16 w-16 rounded-full border-2 border-solid border-emerald-400 p-2 font-bold text-white shadow-lg duration-200 md:h-20 md:w-20 md:hover:scale-125`}
          >
            <Heart
              size={40}
              class={`${colorSwipeMove().right}  " icon-button " inline-block fill-emerald-400`}
            />
          </button>
        </div>
        {charsList().list?.length === 0 ? <NoMatches /> : null}
      </Show>
    </>
  )
}

const DSwipeCard: Component<{ character: AppSchema.Character; match: Any }> = (props) => {
  const apiRef: SwipeCardRef = {}
  apiRef.id = props.character._id
  props.totalSwipes[apiRef.id] = apiRef
  //map every id of an object to a new array
  const age = props.character.persona.attributes.age
    ? props.character.persona.attributes.age[0].split(' ')[0]
    : ''
  return (
    <div class="absolute w-full max-w-5xl">
      <SwipeCard
        zindex="5"
        class="fixed right-[5%] left-[5%] m-auto h-96 max-h-[90%] w-96 max-w-[90%] rounded-lg border-[10px] border-solid border-[var(--bg-800)] bg-[var(--bg-800)] shadow-lg  md:right-[10%] md:left-[10%] md:border-[20px] sm:h-3/4  sm:max-h-[550px] sm:w-9/12 sm:max-w-[550px] lg:right-[calc(14%-18.5rem)]"
        threshold="300"
        rotationmultiplier="7.5"
        maxrotation="90"
        snapbackduration="300"
        bouncepower="0.1"
        id={props.character._id}
        apiRef={apiRef}
        onSwipe={props.swipeAction}
        onMove={props.swipeMovement}
      >
        <div
          class="absolute h-full max-h-full w-full max-w-full bg-cover"
          style={{ 'background-image': `url(${getAssetUrl(props.character.avatar)})` }}
        >
          <div class="size text-shadow absolute bottom-4 w-full p-2 text-3xl text-white sm:bottom-10 sm:text-5xl">
            <span class=" font-black ">{props.character.name}</span> {age}
          </div>
          <Suspense>
            <div class="absolute bottom-1 h-6 overflow-hidden sm:h-10">
              <For each={props.character.persona.attributes.likes}>
                {(attr) => (
                  <div class=" float-left m-1 rounded-md border bg-[var(--hl-900)] bg-opacity-80 px-2 py-1 text-[8px] capitalize sm:py-2 sm:text-[12px]">
                    {attr}
                  </div>
                )}
              </For>
            </div>
          </Suspense>
        </div>
      </SwipeCard>
    </div>
  )
}
const Match: Component<{ character: AppSchema.Character; match: Any }> = (props) => {
  return (
    <div class="flex w-full gap-2">
      <div class="flex h-12 w-full flex-row items-center gap-4 rounded-xl bg-[var(--bg-800)]">
        <A
          class="ml-4 flex h-3/4 cursor-pointer items-center rounded-2xl  sm:w-9/12"
          href={`/likes/${props.character._id}/profile`}
        >
          <AvatarIcon avatarUrl={props.character.avatar} class="mx-4 h-10 w-10 rounded-md" />
          <div class="text-lg font-bold">{props.character.name}</div>
        </A>
      </div>
      <div class="flex flex-row items-center justify-center gap-2 sm:w-3/12">
        <div
          class="ml-4 flex h-3/4 cursor-pointer items-center rounded-2xl sm:w-9/12"
          onClick={() => props.match(props.character._id)}
        >
          <Check class="cursor-pointer text-white/25 hover:text-white" />
          red-800
        </div>
      </div>
    </div>
  )
}

function charToJson(char: AppSchema.Character) {
  const { _id, updatedAt, createdAt, kind, summary, premium, xp, match, avatar, ...json } = char
  return JSON.stringify(json, null, 2)
}

const NoMatches: Component = () => (
  <div class="mt-16 flex w-full justify-center rounded-full text-xl">You have no likes!&nbsp;</div>
)

export default MatchList

function repeat<T>(list: T[], times = 20) {
  const next: any[] = []
  for (let i = 0; i < times; i++) {
    next.push(...list)
  }
  return next
}
