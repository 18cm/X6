import React from 'react'
import { Checkbox } from 'antd'
import { Graph, Cell, DomEvent } from '../../../../src'

export default class Layers extends React.Component {
  private container: HTMLDivElement
  private graph: Graph
  private layer0: Cell
  private layer1: Cell

  state = {
    layer0Visible: true,
    layer1Visible: true,
  }

  componentDidMount() {
    DomEvent.disableContextMenu(this.container)
    const graph = new Graph(this.container)
    const root = graph.model.createRoot()
    const layer0 = root.getChildAt(0)!
    const layer1 = graph.model.createLayer()

    root.insertChild(layer1)
    graph.model.setRoot(root)

    this.graph = graph
    this.layer0 = layer0
    this.layer1 = layer1

    graph.batchUpdate(() => {
      const node1 = graph.addNode({
        parent: layer1, data: 'Hello,',
        x: 20, y: 20, width: 80, height: 30,
        style: {
          fill: '#c0c0c0',
        },
      })

      const node2 = graph.addNode({
        parent: layer1, data: 'Hello,',
        x: 200, y: 20, width: 80, height: 30,
        style: {
          fill: '#c0c0c0',
        },
      })

      const node3 = graph.addNode({
        parent: layer0, data: 'World!',
        x: 110, y: 150, width: 80, height: 30,
      })

      const edge1 = graph.addEdge({
        parent: layer1,
        sourceNode: node1,
        targetNode: node3,
        style: {
          stroke: '#712ed1',
        },
      })
      edge1.geometry!.addPoint(60, 165)

      const edge2 = graph.addEdge({
        parent: layer0,
        sourceNode: node2,
        targetNode: node3,
      })
      edge2.geometry!.addPoint(240, 165)

      const edge3 = graph.addEdge({
        parent: layer0,
        sourceNode: node1,
        targetNode: node2,
        style: {
          edge: 'topToBottom',
        },
      })
      edge3.geometry!.addPoint(150, 30)

      const edge4 = graph.addEdge({
        parent: layer1,
        sourceNode: node2,
        targetNode: node1,
        style: {
          edge: 'topToBottom',
          stroke: '#712ed1',
        },
      })
      edge4.geometry!.addPoint(150, 40)

    })
  }

  refContainer = (container: HTMLDivElement) => {
    this.container = container
  }

  onLayer0Changed = (e: any) => {
    const checked = e.target.checked
    this.setState({ layer0Visible: checked })
    this.graph.model.setVisible(this.layer0, checked)
  }

  onLayer1Changed = (e: any) => {
    const checked = e.target.checked
    this.setState({ layer1Visible: checked })
    this.graph.model.setVisible(this.layer1, checked)
  }

  render() {
    return (
      <div>
        <div ref={this.refContainer} className="graph-container" />
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <Checkbox
            checked={this.state.layer0Visible}
            onChange={this.onLayer0Changed}
          >
            Layer 0
          </Checkbox>
          <Checkbox
            checked={this.state.layer1Visible}
            onChange={this.onLayer1Changed}
          >
            Layer 1
          </Checkbox>
        </div>
      </div>
    )
  }
}