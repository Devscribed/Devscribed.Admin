# AuthLayout

The signed-out shell. Warm paper field, the text wordmark above, one centred card at 480px max-width. Nothing else — no sidebar, no top bar, no theme toggle.

```jsx
<AuthLayout
  title="Create your organization"
  subtitle="One account, one organization. You'll be its first admin."
  footer={<>Already have an account? <a href="/login">Sign in</a></>}
>
  {/* form fields */}
</AuthLayout>
```

Used by signup, login, forgot-password, and reset-password. On narrow viewports the card spans the available width and keeps its horizontal padding.
