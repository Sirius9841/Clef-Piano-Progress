export function scoreFixture(measures: string, options: { title?: string; composer?: string; partName?: string } = {}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>${options.title ?? 'Parser Test'}</work-title></work>
  <identification><creator type="composer">${options.composer ?? 'Clef Test Suite'}</creator></identification>
  <part-list><score-part id="P1"><part-name>${options.partName ?? 'Piano'}</part-name></score-part></part-list>
  <part id="P1">${measures}</part>
</score-partwise>`
}

export const basicMelodyFixture = scoreFixture(`
  <measure number="1">
    <attributes>
      <divisions>4</divisions><key><fifths>0</fifths><mode>major</mode></key>
      <time><beats>4</beats><beat-type>4</beat-type></time>
      <clef><sign>G</sign><line>2</line></clef>
    </attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
    <note><rest/><duration>4</duration><voice>1</voice><staff>1</staff><type>quarter</type></note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><staff>1</staff><type>half</type></note>
  </measure>`)

export const chordFixture = scoreFixture(`
  <measure number="1">
    <attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
    <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>2</staff></note>
    <note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
  </measure>`)

export const pianoVoicesFixture = scoreFixture(`
  <measure number="1">
    <attributes>
      <divisions>2</divisions><staves>2</staves><time><beats>4</beats><beat-type>4</beat-type></time>
      <clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>
    </attributes>
    <note><pitch><step>C</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><staff>1</staff></note>
    <backup><duration>8</duration></backup>
    <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><staff>2</staff></note>
    <forward><duration>2</duration><voice>2</voice><staff>2</staff></forward>
    <note><pitch><step>G</step><octave>3</octave></pitch><duration>2</duration><voice>2</voice><staff>2</staff></note>
  </measure>`)

export const accidentalsFixture = scoreFixture(`
  <measure number="1">
    <attributes><divisions>1</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><alter>1</alter><octave>4</octave></pitch><duration>1</duration><accidental>sharp</accidental><voice>1</voice><staff>1</staff></note>
    <note><pitch><step>D</step><alter>-1</alter><octave>4</octave></pitch><duration>1</duration><accidental>flat</accidental><voice>1</voice><staff>1</staff></note>
  </measure>`)

export const tiesFixture = scoreFixture(`
  <measure number="1">
    <attributes><divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><tie type="start"/><voice>1</voice><staff>1</staff><notations><tied type="start"/></notations></note>
  </measure>
  <measure number="2">
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><tie type="stop"/><voice>1</voice><staff>1</staff><notations><tied type="stop"/></notations></note>
  </measure>`)

export const fractionalFixture = scoreFixture(`
  <measure number="1">
    <attributes><divisions>6</divisions><time><beats>1</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
    <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
    <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff><type>eighth</type><dot/></note>
  </measure>`)

export const contextAndDirectionsFixture = scoreFixture(`
  <measure number="1">
    <attributes><divisions>2</divisions><key><fifths>0</fifths><mode>major</mode></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>100</per-minute></metronome><words>rit.</words><dynamics><p/></dynamics><wedge type="crescendo" number="1"/></direction-type><sound tempo="100"/><staff>1</staff></direction>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><staff>1</staff><notations><articulations><staccato/><accent/></articulations><slur type="start" number="1"/></notations></note>
  </measure>
  <measure number="2">
    <attributes><key><fifths>2</fifths><mode>major</mode></key><time><beats>3+2</beats><beat-type>8</beat-type></time></attributes>
    <direction><offset>2</offset><direction-type><metronome><beat-unit>half</beat-unit><per-minute>60</per-minute></metronome><words>a tempo, dim.</words><dynamics><mf/></dynamics><wedge type="stop" number="1"/><pedal type="start"/></direction-type><voice>2</voice><staff>2</staff></direction>
    <note><rest/><duration>5</duration><voice>1</voice><staff>1</staff></note>
  </measure>`)

export const pickupFixture = scoreFixture(`
  <measure number="0" implicit="yes">
    <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
    <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
  </measure>
  <measure number="1">
    <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>
  </measure>`)

export const graceAndRangeFixture = scoreFixture(`
  <measure number="1">
    <attributes><divisions>2</divisions><time><beats>1</beats><beat-type>4</beat-type></time></attributes>
    <note><grace/><pitch><step>C</step><alter>0.5</alter><octave>4</octave></pitch><voice>1</voice><staff>1</staff></note>
    <note><cue/><pitch><step>C</step><octave>10</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>
  </measure>`)
