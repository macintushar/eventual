import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'eventual';
export const Currency = () => (
  <Select defaultValue="INR">
    <SelectTrigger style={{ width: 200 }}>
      <SelectValue placeholder="Currency" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="INR">INR · Indian rupee</SelectItem>
      <SelectItem value="USD">USD · US dollar</SelectItem>
      <SelectItem value="EUR">EUR · Euro</SelectItem>
    </SelectContent>
  </Select>
);
export const Placeholder = () => (
  <Select>
    <SelectTrigger style={{ width: 200 }}>
      <SelectValue placeholder="Paid by…" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="a">Aarav</SelectItem>
    </SelectContent>
  </Select>
);
