import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, Input } from 'eventual';

export const Form = () => (
  <FieldGroup style={{ width: 340 }}>
    <Field>
      <FieldLabel htmlFor="f-title">Title</FieldLabel>
      <Input id="f-title" defaultValue="Dinner at Toit" />
      <FieldDescription>Shown to everyone in the group.</FieldDescription>
    </Field>
    <Field>
      <FieldLabel htmlFor="f-amt">Amount</FieldLabel>
      <Input id="f-amt" placeholder="0.00" inputMode="decimal" />
    </Field>
  </FieldGroup>
);

export const WithError = () => (
  <Field data-invalid style={{ width: 340 }}>
    <FieldLabel htmlFor="f-mail">Email</FieldLabel>
    <Input id="f-mail" defaultValue="priya@" aria-invalid />
    <FieldError>Enter a valid email address.</FieldError>
  </Field>
);
