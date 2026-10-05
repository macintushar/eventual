import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from 'eventual';
export const Expenses = () => (
  <Table style={{ width: 460 }}>
    <TableCaption>Goa trip · October</TableCaption>
    <TableHeader>
      <TableRow><TableHead>Expense</TableHead><TableHead>Paid by</TableHead><TableHead style={{ textAlign: 'right' }}>Amount</TableHead></TableRow>
    </TableHeader>
    <TableBody>
      <TableRow><TableCell>Beach shack lunch</TableCell><TableCell>Aarav</TableCell><TableCell style={{ textAlign: 'right' }}>₹2,480.00</TableCell></TableRow>
      <TableRow><TableCell>Scooter rental</TableCell><TableCell>Priya</TableCell><TableCell style={{ textAlign: 'right' }}>₹1,200.00</TableCell></TableRow>
      <TableRow><TableCell>Airbnb</TableCell><TableCell>You</TableCell><TableCell style={{ textAlign: 'right' }}>₹14,000.00</TableCell></TableRow>
    </TableBody>
  </Table>
);
