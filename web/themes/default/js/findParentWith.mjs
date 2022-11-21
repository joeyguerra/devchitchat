export default function findParentWith(node, predicate){
    if(!node) return null
    if(predicate(node)) return node
    return findParentWith(node.parentNode, predicate)
}