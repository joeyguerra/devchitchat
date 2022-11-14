export default doc => {
	function getTypes(node){
		var type = node.getAttribute('itemtype')
		if(!type) return []
		return type.split(' ')
	}
	function getValue(node){
		if(node.getAttribute('itemprop') === null) return null
		switch(node.tagName.toLowerCase()){
			case 'meta':
				return node.getAttribute('content') || ''
			case 'audio':
			case 'embed':
			case 'iframe':
			case 'img':
			case 'source':
			case 'track':
			case 'video':
				return node.getAttribute('src')
			case 'a':
			case 'area':
			case 'link':
				return node.getAttribute('href')
			case 'object':
				return node.getAttribute('data')
			case 'data':
				return node.getAttribute('value') || ''
			case 'time':
				return node.getAttribute('datetime')
			default:
				return node.innerHTML
		}
	}
	return {
		toObject: function(node, memory){
			var result = {properties: {}}
			result.type = getTypes(node)
			var itemid = node.getAttribute('itemid')
			if(itemid) result.id = itemid
			var properties = node.querySelectorAll('[itemprop]')
			for(var i = 0 i < properties.length i++){
				var value = null
				var item = properties[i]
				var key = item.getAttribute('itemprop')
				if(item.getAttribute('itemscope') !== null){
					if(memory.indexOf(item) !== -1){
						value = 'ERROR'
					}else{
						memory.push(item)
						value = this.toObject(item, memory)
						memory.pop()
					}
				}else{
					value = getValue(item)
				}
				result.properties[key] = value
			}
			return result
		}
		, scopes: function(nodes){
			if(!nodes) nodes = doc.querySelectorAll('[itemscope]:not([itemprop])')
			var scopes = []
			for(var i = 0; i < nodes.length; i++){
				var scope = nodes[i]
				scopes.push(this.toObject(scope, []))
			}
			return scopes
		}
	}
}