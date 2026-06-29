import showdown from 'showdown'

const markdown = new showdown.Converter()
markdown.setOption('simpleLineBreaks', true)
markdown.setOption('tables', true)

export { markdown }
