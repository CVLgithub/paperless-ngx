import { Component, OnDestroy, inject, signal } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { Subject, takeUntil } from 'rxjs'
import { BootstrapIconComponent } from 'src/app/components/common/bootstrap-icon/bootstrap-icon.component'
import {
  MergeWorkflowHandle,
  MergeWorkflowPhase,
  MergeWorkflowState,
} from 'src/app/services/merge-workflow.service'

export type MergeStepStatus = 'pending' | 'active' | 'done'

@Component({
  selector: 'pngx-merge-progress-dialog',
  templateUrl: './merge-progress-dialog.component.html',
  styleUrls: ['./merge-progress-dialog.component.scss'],
  imports: [BootstrapIconComponent],
})
export class MergeProgressDialogComponent implements OnDestroy {
  private readonly activeModal = inject(NgbActiveModal)
  private readonly destroy$ = new Subject<void>()

  private handle?: MergeWorkflowHandle

  readonly state = signal<MergeWorkflowState>({
    phase: 'merging',
    progress: 16,
    sourceCount: 2,
    deleteOriginals: false,
  })

  attach(handle: MergeWorkflowHandle): void {
    this.handle = handle
    handle.state$.pipe(takeUntil(this.destroy$)).subscribe((nextState) => {
      this.state.set(nextState)
      if (nextState.phase === 'completed') {
        this.activeModal.close(nextState.documentId)
      }
    })
  }

  getStepStatus(stepIndex: 0 | 1 | 2): MergeStepStatus {
    const phase: MergeWorkflowPhase = this.state().phase
    if (phase === 'completed') return 'done'
    if (phase === 'merging') {
      return stepIndex === 0 ? 'active' : 'pending'
    }
    if (phase === 'ocr') {
      if (stepIndex === 0) return 'done'
      return stepIndex === 1 ? 'active' : 'pending'
    }
    if (phase === 'archiving') {
      if (stepIndex < 2) return 'done'
      return 'active'
    }
    return 'pending'
  }

  continueInBackground(): void {
    this.handle?.continueInBackground()
    this.activeModal.dismiss('background')
  }

  closeOnError(): void {
    this.handle?.cancelTracking()
    this.activeModal.dismiss('error')
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }
}
