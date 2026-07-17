/**
 * shared yargs option helpers
 */

/**
 * Option definition mixin for repeatable, comma-separated string list
 * options (e.g. --include, --exclude).
 * The single value "false" yields the match-all pattern ['**'].
 */
export const stringList = {
  type: 'string',
  array: true,
  coerce: (values) =>
    values.length === 1 && values[0].trim() === 'false'
      ? ['**']
      : values.reduce((values, value) => values.concat(value.split(',').map((value) => value.trim())), [])
}
