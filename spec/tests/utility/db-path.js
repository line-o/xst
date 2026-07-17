import { test } from 'tape'
import { assertAbsoluteDbPath, normalizeDbPath } from '../../../utility/db-path.js'

test('assertAbsoluteDbPath', function (t) {
  t.test('accepts absolute paths', function (st) {
    st.equals(assertAbsoluteDbPath('/db'), '/db')
    st.equals(assertAbsoluteDbPath('/'), '/')
    st.equals(assertAbsoluteDbPath('/db/apps/'), '/db/apps/')
    st.end()
  })

  t.test('rejects relative paths with a hint', function (st) {
    st.throws(
      () => assertAbsoluteDbPath('my/collection'),
      /Did you mean "\/db\/my\/collection"\?/,
      'plain relative path hints /db prefix')
    st.throws(
      () => assertAbsoluteDbPath('db/apps'),
      /Did you mean "\/db\/apps"\?/,
      'path starting with db/ hints leading slash only')
    st.throws(
      () => assertAbsoluteDbPath('db'),
      /Did you mean "\/db"\?/,
      'bare db hints /db')
    st.end()
  })

  t.test('rejects empty and non-string values', function (st) {
    st.throws(() => assertAbsoluteDbPath(''), /non-empty/)
    st.throws(() => assertAbsoluteDbPath(undefined), /non-empty/)
    st.throws(() => assertAbsoluteDbPath(null), /non-empty/)
    st.end()
  })
})

test('normalizeDbPath', function (t) {
  t.test('resolves / to /db', function (st) {
    st.equals(normalizeDbPath('/'), '/db')
    st.end()
  })

  t.test('strips trailing slashes', function (st) {
    st.equals(normalizeDbPath('/db/'), '/db')
    st.equals(normalizeDbPath('/db/apps///'), '/db/apps')
    st.equals(normalizeDbPath('//'), '/db')
    st.end()
  })

  t.test('leaves canonical paths untouched', function (st) {
    st.equals(normalizeDbPath('/db'), '/db')
    st.equals(normalizeDbPath('/db/apps'), '/db/apps')
    st.end()
  })
})
