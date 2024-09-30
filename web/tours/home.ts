import Shepherd from 'shepherd.js'
import { tourTitle } from './util'
import { getStore } from '../store/create'
import { isMobile, setStoredValue } from '../shared/hooks'
import { isLoggedIn } from '../store/api'

export { homeTour as default }

export const homeTour = new Shepherd.Tour({
  useModalOverlay: true,

  defaultStepOptions: {
    scrollTo: true,
    classes: 'bg-800',
  },
})

const win: any = window
win.homeTourCancel = () => {
  homeTour.cancel()
  setStoredValue('tour-home', true)
}

const menuSide = isMobile() ? 'bottom' : 'right'
const title = (text: string) => tourTitle(text, 'homeTourCancel')

const prev = {
  text: 'Back',
  classes: 'btn btn-primary',
  action: homeTour.back,
}

const next = {
  text: 'Next',
  classes: 'btn btn-primary',
  action: homeTour.next,
}

homeTour.addSteps([
  {
    id: 'tour-welcome',
    text: `${title(
      'Welcome to Charluv!'
    )} Charluv allows you to chat with fictional characters using AI.<br />Register for free and chat with any character. <br />You can subscribe for premium to access larger context, voices, unlimited chat and other features.`,
    buttons: [next],
  },
])

if (!isLoggedIn()) {
  homeTour.addStep({
    id: 'tour-register',
    text: `${title(
      'Guest Mode'
    )}You are currently in guest mode. Your need to register, it is free, no email needed.`,
    attachTo: {
      element: '.tour-register',
      on: menuSide,
    },
    buttons: [prev, next],
  })
}

homeTour.addSteps([
  {
    id: 'tour-user-profile',
    text: `<p class="font-bold text-hl-500 pb-1">Set up your Profile</p> You can change your handle and avatar.<br />You can use the <code>Persona</code> button to impersonate a character and use their persona.`,
    attachTo: {
      element: '.tour-user-profile',
      on: menuSide,
    },
    buttons: [prev, next],
  },
  {
    id: 'tour-likes',
    text: `${title(
      'Likes'
    )} Under Likes you find our curated library of characters that Like you and want to Match with you.`,
    attachTo: {
      element: '.tour-likes',
      on: menuSide,
    },
    buttons: [prev, next],
  },
  {
    id: 'tour-character',
    text: `${title(
      'Creating Characters'
    )} Here you find your Matches ie characters. You can also create your own with the asssistance of AI and import character cards from other sites.`,
    attachTo: {
      element: '.tour-character',
      on: menuSide,
    },
    buttons: [
      {
        text: 'Back',
        classes: 'btn btn-primary',
        action: async () => {
          await getStore('settings').menu(true)
          homeTour.back()
        },
      },
      {
        text: 'Next',
        classes: 'btn btn-primary',
        action: async () => {
          await getStore('settings').closeMenu()
          homeTour.next()
        },
      },
    ],
  },

  {
    id: 'tour-credits',
    text: `${title(
      'Credits'
    )} Actions will cost you some credits. Don't worry they recharge a bit every two minutes. You get near unlimited credits when you got a premium account. `,
    attachTo: {
      element: '.tour-credits',
      on: menuSide,
    },
    buttons: [prev, next],
  },

  {
    id: 'tour-first-chat',
    text: `${title(
      'Have Your First Chat'
    )}You can quickly jump in and chat with a friendly pre-built character to see to see what it's like. Better pick a preferred character under likes first.`,
    attachTo: {
      element: isMobile() ? '.tour-first-chat-mobile' : '.tour-first-chat',
      on: 'bottom',
    },
    buttons: [
      {
        text: 'Back',
        classes: 'btn btn-primary',
        action: async () => {
          await getStore('settings').menu(true)
          homeTour.back()
        },
      },
      {
        text: 'Done',
        classes: 'btn btn-primary',
        action: () => {
          homeTour.complete()
          setStoredValue('tour-home', true)
        },
      },
    ],
  },
])

if (isLoggedIn()) {
  homeTour.removeStep('tour-register')
}
