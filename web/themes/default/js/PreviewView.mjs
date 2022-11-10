import NotificationCenter from '../../../../lib/NotificationCenter.mjs'
import {Events} from '../../../../lib/Models.mjs'
export default class PreviewView {
    constructor(container, model, delegate){
        this.container = container
        this.model = model
        this.delegate = delegate
        this.text = container.querySelector('.message .text')
		this.container.style.display = 'none'
		this.container.style.position = 'absolute'
		this.container.style.top = '50px'
		this.container.style.right = '20px'
		this.model.observe('text', this)
        NotificationCenter.subscribe(Events.HAS_STARTED_TYPING, this.show.bind(this), null)
		NotificationCenter.subscribe(Events.HAS_STOPPED_TYPING, this.hide.bind(this), null)
    }
    update(key, old, v){
        this.text.innerHTML = v
    }
    show(){
        this.container.style.display = 'block'
    }
    hide(){
        this.container.style.display = 'none'
    }
}