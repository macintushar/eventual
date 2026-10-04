import { Input, InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from 'eventual';
export const Search = () => (
  <InputGroup style={{ width: 340 }}>
    <InputGroupInput placeholder="Invite by email" />
    <InputGroupAddon align="inline-end"><InputGroupButton>Send</InputGroupButton></InputGroupAddon>
  </InputGroup>
);
