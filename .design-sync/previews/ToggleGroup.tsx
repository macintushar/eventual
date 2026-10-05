import { ToggleGroup, ToggleGroupItem } from 'eventual';
export const SplitType = () => (
  <ToggleGroup type="single" defaultValue="equal" variant="outline">
    <ToggleGroupItem value="equal">Equal</ToggleGroupItem>
    <ToggleGroupItem value="shares">Shares</ToggleGroupItem>
    <ToggleGroupItem value="exact">Exact</ToggleGroupItem>
  </ToggleGroup>
);
