import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from 'eventual';
export const Faq = () => (
  <Accordion type="single" collapsible defaultValue="a" style={{ width: 400 }}>
    <AccordionItem value="a"><AccordionTrigger>How are shares calculated?</AccordionTrigger><AccordionContent>Each member's weight divides the total proportionally.</AccordionContent></AccordionItem>
    <AccordionItem value="b"><AccordionTrigger>Can guests settle up?</AccordionTrigger><AccordionContent>Yes, once they claim their profile.</AccordionContent></AccordionItem>
  </Accordion>
);
