import test from 'node:test'
import assert from 'node:assert/strict'

class Grouper {
    constructor(){

    }
    group(messages){
        const grouped = []
        for(let i = 0; i < messages.length; i++){
            const current = messages[i]
            const next = messages[i+1]
            if(current.username == next?.username){
                if(!grouped[grouped.length - 1]) grouped.push({messages: []})
                const gMessages = grouped[grouped.length - 1]
                gMessages.messages.push(current)
            } else {
                const gMessages = grouped[grouped.length - 1]
                gMessages.messages.push(current)
                if(next) grouped.push({messages: []})
            }
        }
        return grouped
    }
}
test('Grouped Messages', async t=>{
    await t.test('grouping', async ()=>{
        const messages = []
        let i = 0
        for(i; i < 3; i++){
            messages.push({text: `message ${i}`, username: 'ijoeyguerra'})
        }
        for(i; i < 7; i++){
            messages.push({text: `message ${i}`, username: 'joeyguerra'})
        }
        for(i; i < 10; i++){
            messages.push({text: `message ${i}`, username: 'notjoey'})
        }
        messages.push({text: `message ${i}`, username: 'notjoeyjoey'})

        const expected = [
            {messages: [
                {text: `message 0`, username: 'ijoeyguerra'},
                {text: `message 1`, username: 'ijoeyguerra'},
                {text: `message 2`, username: 'ijoeyguerra'}
            ]},
            {messages: [
                {text: `message 3`, username: 'joeyguerra'},
                {text: `message 4`, username: 'joeyguerra'},
                {text: `message 5`, username: 'joeyguerra'},
                {text: `message 6`, username: 'joeyguerra'},
            ]},
            {messages: [
                {text: `message 7`, username: 'notjoey'},
                {text: `message 8`, username: 'notjoey'},
                {text: `message 9`, username: 'notjoey'}
            ]},
            {messages: [
                {text: `message 10`, username: 'notjoeyjoey'},
            ]},
        ]
        const sut = new Grouper()
        const actual = sut.group(messages)
        assert.deepEqual(actual, expected)
    })
})