import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'eventual';
export const Hint = () => (
  <TooltipProvider>
    <Tooltip defaultOpen>
      <TooltipTrigger asChild><Button variant="outline">Settle up</Button></TooltipTrigger>
      <TooltipContent>Record a payment to Aarav</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);
