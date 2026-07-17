import { readFileSync } from 'node:fs'
import { test } from 'tape'
import { isSupported } from '../../../utility/node-version.js'

// test against the actual supported range (single source of truth)
const { engines } = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url)))

test('isSupported with the engines.node range from package.json', function (t) {
  t.test('rejects Node.js versions below 20.19.0', function (st) {
    st.notOk(isSupported('18.19.0', engines.node), '18.19.0 is not supported')
    st.notOk(isSupported('20.18.0', engines.node), '20.18.0 is not supported')
    st.end()
  })

  t.test('accepts the 20.x line from 20.19.0 on', function (st) {
    st.ok(isSupported('20.19.0', engines.node), '20.19.0 is supported')
    st.ok(isSupported('20.20.0', engines.node), '20.20.0 is supported')
    st.end()
  })

  t.test('rejects 21.x and 22.x below 22.11.0', function (st) {
    st.notOk(isSupported('21.0.0', engines.node), '21.0.0 is not supported')
    st.notOk(isSupported('22.10.0', engines.node), '22.10.0 is not supported')
    st.end()
  })

  t.test('accepts 22.11.0 and later', function (st) {
    st.ok(isSupported('22.11.0', engines.node), '22.11.0 is supported')
    st.ok(isSupported('24.0.0', engines.node), '24.0.0 is supported')
    st.end()
  })
})
