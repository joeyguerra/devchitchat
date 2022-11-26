import NotificationCenter from '../../../../lib/NotificationCenter.mjs'
import {Events} from '../../../../lib/Models.mjs'
export default class PreviewView {
    #md
    constructor(container, model, delegate){
        this.container = container
        this.model = model
        this.delegate = delegate
        this.#md = this.delegate.win.markdownit()
        this.text = container.querySelector('.message .text')
		this.model.observe('text', this)
        NotificationCenter.subscribe(Events.HAS_STARTED_TYPING, this.show.bind(this), null)
		NotificationCenter.subscribe(Events.HAS_STOPPED_TYPING, this.hide.bind(this), null)
    }
    update(key, old, v){
        this.text.innerHTML = this.#md.render(v)
    }
    show(){
        this.container.style.display = ''
    }
    hide(){
        this.container.style.display = 'none'
    }
}