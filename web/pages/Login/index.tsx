import { Component, createMemo, createSignal, createEffect, Show } from 'solid-js'
import { useNavigate, useLocation } from '@solidjs/router'
import Alert from '../../shared/Alert'
import Divider from '../../shared/Divider'
import PageHeader from '../../shared/PageHeader'
import { toastStore, userStore } from '../../store'
import { getStrictForm, setComponentPageTitle } from '../../shared/util'
import TextInput from '../../shared/TextInput'
import Button from '../../shared/Button'

const LoginPage: Component = () => {
  setComponentPageTitle('Login')
  const store = userStore()
  const [register, setRegister] = createSignal(false)
  const location = useLocation()

  const pathname = createMemo(() => location.pathname)
  /** Friendly error message passed out of the mutation, if it exists. */
  const loginError = createMemo(() => {
    if (!store.error) return null
    if (store.error.includes('NetworkError')) {
      return "We couldn't reach our servers."
    }

    return 'Something went wrong.'
  })

  createEffect(async () => {
    if (pathname() === '/register') {
      setRegister(true)
      setComponentPageTitle('Register')
    }
  })

  return (
    <div class="flex w-full flex-col items-center">
      <div class="my-4 border-b border-white/5" />
      <PageHeader
        title={<div class="flex w-full justify-center">Welcome</div>}
        subtitle={
          <span>
            <a class="link" onClick={() => setRegister(false)}>
              Login
            </a>{' '}
            to your account or&nbsp;
            <a class="link" onClick={() => setRegister(true)}>
              register
            </a>
            &nbsp;or continue as a guest.
          </span>
        }
      />
      <div class="w-full max-w-sm">
        <Show when={register()}>
          <RegisterForm isLoading={store.loading} />
        </Show>
        <Show when={!register()}>
          <LoginForm isLoading={store.loading} />
        </Show>
        <Show when={loginError()}>
          <Divider />
          <Alert schema="error" title="Failed to log in.">
            {loginError()}
          </Alert>
        </Show>
      </div>
      <div class="mt-8 w-full gap-4">
        <Show when={!register()}>
          <p class="flex justify-center text-xl text-[var(--hl-400)]">Why register?</p>
          <div class="flex flex-col items-center text-center">
            <p>
              You need an account to use the virtual dating services and see all the characters.
            </p>
            <p>
              If you choose to register your data will be stored and accessible on any devices you
              login with.
            </p>
          </div>
        </Show>
        <Show when={register()}>
          <p class="flex justify-center text-xl text-[var(--hl-400)]">
            Why do I need an access code?
          </p>

          <div class="mx-4 flex flex-col items-center text-center ">
            <p>
              We need to have some sort of control on the amount of people joining since we do not
              require an email for registration (we find privacy more important). You can join our
              Discord, check our Twitter or try <b>AIVO8592094</b>{' '}
              <span class="text-sm">(this code could run out)</span>
            </p>
          </div>
        </Show>
      </div>
    </div>
  )
}

export default LoginPage

type FormProps = { isLoading: boolean }

const RegisterForm: Component<FormProps> = (props) => {
  const navigate = useNavigate()
  const register = (evt: Event) => {
    const { username, password, confirm, handle, invitecode } = getStrictForm(evt, {
      handle: 'string',
      username: 'string',
      password: 'string',
      confirm: 'string',
      invitecode: 'string',
    })

    if (!handle || !username || !password || !invitecode) return
    if (password !== confirm) {
      toastStore.warn('Passwords do not match', 2)
      return
    }

    userStore.register({ handle, username, password, invitecode }, () => navigate('/profile'))
  }

  return (
    <form onSubmit={register} class="flex flex-col gap-6">
      <div class="flex flex-col gap-2">
        <TextInput label="Display Name" fieldName="handle" placeholder="Display name" required />
        <TextInput label="Username" fieldName="username" placeholder="Username" required />
        <TextInput
          label="Password"
          fieldName="password"
          placeholder="Password"
          type="password"
          required
        />
        <TextInput fieldName="confirm" placeholder="Confirm Password" type="password" required />
        <TextInput
          label="Invite code"
          fieldName="invitecode"
          placeholder="Check below for a code!"
          required
        />
        <div></div>
      </div>

      <Button type="submit" disabled={props.isLoading}>
        {props.isLoading ? 'Registering...' : 'Register'}
      </Button>
    </form>
  )
}

const LoginForm: Component<FormProps> = (props) => {
  const navigate = useNavigate()
  const login = (evt: Event) => {
    const { username, password } = getStrictForm(evt, { username: 'string', password: 'string' })
    if (!username || !password) return

    userStore.login(username, password, () => navigate('/dashboard'))
  }

  return (
    <form onSubmit={login} class="flex flex-col gap-6">
      <div class="flex flex-col gap-2">
        <TextInput fieldName="username" placeholder="Username" autocomplete="username" required />
        <TextInput
          fieldName="password"
          placeholder="Password"
          type="password"
          autocomplete="current-password"
          required
        />
      </div>

      <Button type="submit" disabled={props.isLoading}>
        {props.isLoading ? 'Logging in...' : 'Login'}
      </Button>
    </form>
  )
}
