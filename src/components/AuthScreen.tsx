import { Alert, Button, Card, Form, Input, Label, Spinner, TextField } from '@heroui/react'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'

import { useAccount } from '@/account'

export function AuthScreen() {
  const navigate = useNavigate()
  const { profile, isLoading, login } = useAccount()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isLoading && profile) void navigate({ to: '/profile', replace: true })
  }, [isLoading, navigate, profile])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      await login({ email, password })
      await navigate({ to: '/profile', replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to log in.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading || profile) {
    return (
      <main className="auth-stage auth-loading-stage">
        <Spinner role="status" aria-label="Loading account" />
      </main>
    )
  }

  return (
    <main className="auth-stage">
      <section className="auth-shell" aria-labelledby="auth-title">
        <div className="auth-copy">
          <span className="eyebrow">Welcome back</span>
          <h1 id="auth-title">Log in to Markit</h1>
          <p>Access your preferences and personalized shopping profile.</p>
        </div>

        <Card className="auth-card">
          <Card.Content>
            <Form className="auth-form" onSubmit={submit}>
              <TextField
                type="email"
                value={email}
                onChange={setEmail}
                autoComplete="email"
                isRequired
                autoFocus
              >
                <Label>Email address</Label>
                <Input placeholder="you@example.com" />
              </TextField>
              <TextField
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                maxLength={128}
                isRequired
              >
                <Label>Password</Label>
                <Input placeholder="Your password" />
              </TextField>

              {error ? (
                <Alert status="danger" className="auth-alert" role="alert">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{error}</Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}
              <Button type="submit" fullWidth className="auth-submit" isDisabled={isSubmitting}>
                {isSubmitting ? <Spinner size="sm" color="current" /> : null}
                {isSubmitting ? 'Logging in…' : 'Log in'}
              </Button>
            </Form>
          </Card.Content>
        </Card>

        <p className="auth-security-note">
          This is a private account. New account registration is disabled.
        </p>
      </section>
    </main>
  )
}
