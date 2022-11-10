
export default class ReconnectingCounterView {
    constructor(container, model, delegate){
        this.container = container
        this.model = model
        this.delegate = delegate
		this.model.observe('times', this)
    }
    show(){
        this.container.style.display = 'block'
    }
    hide(){
        this.container.style.display = 'none'
    }
    update(key, old, v){
        if(v == 0){
            this.hide()
        }else{
            this.show()
        }
        this.container.innerHTML = v
    }
}