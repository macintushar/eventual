import { Slider } from 'eventual';
export const Single = () => <div style={{ width: 280 }}><Slider defaultValue={[40]} max={100} step={1} /></div>;
export const Range = () => <div style={{ width: 280 }}><Slider defaultValue={[20, 70]} max={100} step={1} /></div>;
