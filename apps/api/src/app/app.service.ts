import { Injectable } from '@nestjs/common'
import { Subject, Observable, Subscription } from 'rxjs'
const perf = require('execution-time')()

import { nodeA, nodeB } from './Nodes.singleton'
import SSESubject from './Subject.singleton'

@Injectable()
export class AppService {
  private subject: Subject<Observable<void>>
  private subscription: Subscription
  private perfData = []

  public async initTransfer() {
    await nodeA.init()
    await nodeB.init()
  }

  public startSyncQueue(bufferSizeInKB: number) {
    this.subject = new Subject()
    this.subscription = this.subject.subscribe({
      next: observable => {
        observable.subscribe({
          complete: this.triggerPerfs.bind(this, bufferSizeInKB),
        })
      },
    })

    this.triggerPerfs(bufferSizeInKB)
  }

  public stopSyncQueue() {
    this.subject.complete()
    this.subscription.unsubscribe()
    this.perfData = []
  }

  private triggerPerfs(bufferSizeInKB: number = 10): void {
    const observable = new Observable<void>(subscriber => {
      this.writeReadAndGetPerfs(bufferSizeInKB).then(({ write, read }) => {
        this.pushPerfData(write, read)
        this.propagateSubjectUpdate()

        subscriber.complete()
      })
    })

    this.subject.next(observable)
  }

  private async writeReadAndGetPerfs(
    bufferSizeInKB: number = 10
  ): Promise<{ write: number; read: number }> {
    const buffer = this.buildBuffer(bufferSizeInKB)

    perf.start('write')
    const file = await nodeA.add(buffer)
    const writePerf = perf.stop('write')
    console.log('Hash:\n', file.path)

    perf.start('read')
    await nodeB.get(file.path)
    const readPerf = perf.stop('read')

    return {
      write: writePerf.time,
      read: readPerf.time,
    }
  }

  public buildBuffer(bufferSizeInKB) {
    const size = bufferSizeInKB * 1000
    const date = new Date().toISOString()
    let content = ''

    for (let i = 0; i < size / date.length; i++) {
      content += date
    }

    const buffer = Buffer.alloc(size)
    buffer.write(content)

    return buffer
  }

  pushPerfData(write, read) {
    this.perfData.push({ write, read })
  }

  propagateSubjectUpdate() {
    SSESubject.next(this.perfData)
  }
}
