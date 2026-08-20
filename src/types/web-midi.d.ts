interface Navigator {
  requestMIDIAccess?: (options?: { sysex?: boolean; software?: boolean }) => Promise<MIDIAccess>
}

interface MIDIMessageEvent extends Event {
  readonly data: Uint8Array
}

interface MIDIConnectionEvent extends Event {
  readonly port: MIDIPort
}

interface MIDIPort extends EventTarget {
  readonly id: string
  readonly manufacturer: string | null
  readonly name: string | null
  readonly state: 'connected' | 'disconnected'
  readonly connection: 'open' | 'closed' | 'pending'
  readonly type: 'input' | 'output'
  open(): Promise<MIDIPort>
  close(): Promise<MIDIPort>
}

interface MIDIInput extends MIDIPort {
  readonly type: 'input'
  onmidimessage: ((event: MIDIMessageEvent) => void) | null
}

interface MIDIInputMap extends ReadonlyMap<string, MIDIInput> {
  forEach(callbackfn: (value: MIDIInput, key: string, map: MIDIInputMap) => void): void
}

interface MIDIAccess extends EventTarget {
  readonly inputs: MIDIInputMap
  onstatechange: ((event: MIDIConnectionEvent) => void) | null
}
