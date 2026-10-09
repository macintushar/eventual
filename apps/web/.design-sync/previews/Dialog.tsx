import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from 'eventual';
export const Confirm = () => (
  <Dialog open modal={false}>
    <DialogContent>
      <DialogHeader><DialogTitle>Delete “Goa trip”?</DialogTitle><DialogDescription>All 6 expenses will be removed for every member.</DialogDescription></DialogHeader>
      <DialogFooter><Button variant="ghost">Cancel</Button><Button variant="destructive">Delete group</Button></DialogFooter>
    </DialogContent>
  </Dialog>
);
