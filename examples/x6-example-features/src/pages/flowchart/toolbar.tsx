import React from 'react'
import { Radio } from 'antd'
import { Toolbar, Menu } from '@antv/x6-components'
import { Graph, UndoManager, View } from '@antv/x6'

export class GraphToolbar extends React.Component<
  GraphToolbar.Props,
  GraphToolbar.State
> {
  private graph: Graph
  private undoManager: UndoManager
  private commands: GraphToolbar.Command[][]

  constructor(props: GraphToolbar.Props) {
    super(props)

    this.graph = props.graph
    this.undoManager = UndoManager.create(props.graph)
    this.commands = [
      [
        {
          name: 'zoomIn',
          icon: 'zoom-in',
          tooltip: 'Zoom In',
          handler: () => {
            let scale = this.graph.view.scale
            if (scale >= 8) {
              scale += 8
            } else if (scale >= 4) {
              scale += 4
            } else if (scale >= 2) {
              scale += 1
            } else if (scale >= 1.5) {
              scale += 0.5
            } else if (scale >= 1) {
              scale += 0.25
            } else if (scale >= 0.7) {
              scale += 0.15
            } else if (scale >= 0.4) {
              scale += 0.1
            } else if (scale >= 0.15) {
              scale += 0.05
            } else if (scale >= 0.01) {
              scale += 0.01
            }
            this.graph.zoomTo(scale)
          },
        },
        {
          name: 'zoomOut',
          icon: 'zoom-out',
          tooltip: 'Zoom Out',
          handler: () => {
            let scale = this.graph.view.scale
            if (scale <= 0.15) {
              scale -= 0.01
            } else if (scale <= 0.4) {
              scale -= 0.05
            } else if (scale <= 0.7) {
              scale -= 0.1
            } else if (scale <= 1) {
              scale -= 0.15
            } else if (scale <= 1.5) {
              scale -= 0.25
            } else if (scale <= 2) {
              scale -= 0.5
            } else if (scale <= 4) {
              scale -= 1
            } else if (scale <= 8) {
              scale -= 4
            } else if (scale <= 16) {
              scale -= 8
            }
            this.graph.zoomTo(scale)
          },
        },
      ],
      [
        {
          name: 'undo',
          icon: 'undo',
          tooltip: 'Undo',
          shortcut: 'Cmd + Z',
          handler: () => this.undoManager.undo(),
        },
        {
          name: 'redo',
          icon: 'redo',
          tooltip: 'Redo',
          shortcut: 'Cmd + Shift + Z',
          handler: () => this.undoManager.redo(),
        },
      ],
      [
        {
          name: 'delete',
          icon: 'delete',
          tooltip: 'Delete',
          shortcut: 'Delete',
          handler: () => this.graph.deleteCells(),
        },
      ],
    ]

    this.commands.forEach(items =>
      items.forEach(item => {
        if (item.shortcut) {
          const shortcut = item.shortcut
            .replace('Delete', 'backspace')
            .replace('Cmd', 'command')
            .toLowerCase()
          this.graph.bindKey(shortcut, item.handler)
        }
      }),
    )

    this.graph.on(Graph.events.selectionChanged, this.updateState)
    this.graph.view.on(View.events.scale, this.updateState)
    this.graph.view.on(View.events.scaleAndTranslate, this.updateState)
    this.undoManager.on(UndoManager.events.undo, this.updateState)
    this.undoManager.on(UndoManager.events.redo, this.updateState)

    this.state = this.getNextState()
  }

  updateState = () => {
    this.setState(this.getNextState())
  }

  getNextState() {
    return {
      zoomIn: this.graph.view.scale === this.graph.maxScale,
      zoomOut: this.graph.view.scale === this.graph.minScale,
      undo: !this.undoManager.canUndo(),
      redo: !this.undoManager.canRedo(),
      delete: this.graph.getSelectedCells().length <= 0,
    }
  }

  resetZoom = () => {
    if (this.graph.view.scale !== 1) {
      this.graph.zoomTo(1)
    }
  }

  onClick = (name: string) => {
    if (name === 'resetView') {
      this.graph.zoomTo(1)
    } else if (
      name === '25' ||
      name === '50' ||
      name === '75' ||
      name === '100' ||
      name === '125' ||
      name === '150' ||
      name === '200' ||
      name === '400'
    ) {
      const scale = parseInt(name, 10) / 100
      this.graph.zoomTo(scale)
    }
  }

  renderZoomDropdown() {
    const MenuItem = Menu.Item
    const Divider = Menu.Divider

    return (
      <Menu hasIcon={false}>
        <MenuItem name="resetView" hotkey="Cmd+H">
          重置视口
        </MenuItem>
        <MenuItem name="fitWindow" hotkey="Cmd+Shift+H">
          适应窗口
        </MenuItem>
        <Divider />
        <MenuItem name="25">25%</MenuItem>
        <MenuItem name="50">50%</MenuItem>
        <MenuItem name="75">75%</MenuItem>
        <MenuItem name="100">100%</MenuItem>
        <MenuItem name="125">125%</MenuItem>
        <MenuItem name="150">150%</MenuItem>
        <MenuItem name="200">200%</MenuItem>
        <MenuItem name="400">400%</MenuItem>
      </Menu>
    )
  }

  render() {
    return (
      <Toolbar
        onClick={this.onClick}
        hoverEffect={true}
        align="right"
        extra={
          <Radio.Group value="mutate">
            <Radio.Button value="mutate">变更流程</Radio.Button>
            <Radio.Button value="revert">流程回滚</Radio.Button>
          </Radio.Group>
        }
      >
        <Toolbar.Item dropdown={this.renderZoomDropdown()}>
          {(this.graph.view.scale * 100).toFixed(0)}%
        </Toolbar.Item>
        {this.commands.map(items => (
          <Toolbar.Group key={items.map(i => i.name).join('-')}>
            {items.map(item => (
              <Toolbar.Item
                key={item.name}
                name={item.name}
                icon={item.icon}
                tooltip={
                  item.shortcut
                    ? `${item.tooltip}(${item.shortcut})`
                    : item.tooltip
                }
                disabled={(this.state as any)[item.name] as boolean}
                onClick={item.handler}
              />
            ))}
          </Toolbar.Group>
        ))}
      </Toolbar>
    )
  }
}

export namespace GraphToolbar {
  export interface Props {
    graph: Graph
  }

  export interface State {
    zoomIn: boolean
    zoomOut: boolean
    redo: boolean
    undo: boolean
    delete: boolean
  }

  export interface Command {
    name: string
    icon: string
    tooltip: string
    shortcut?: string
    handler: () => void
  }
}