import { ComponentFixture, TestBed } from '@angular/core/testing'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { BehaviorSubject } from 'rxjs'
import {
  MergeWorkflowHandle,
  MergeWorkflowState,
} from 'src/app/services/merge-workflow.service'
import { MergeProgressDialogComponent } from './merge-progress-dialog.component'

describe('MergeProgressDialogComponent', () => {
  let component: MergeProgressDialogComponent
  let fixture: ComponentFixture<MergeProgressDialogComponent>
  let activeModal: { close: jest.Mock; dismiss: jest.Mock }

  beforeEach(async () => {
    activeModal = {
      close: jest.fn(),
      dismiss: jest.fn(),
    }

    await TestBed.configureTestingModule({
      imports: [MergeProgressDialogComponent],
      providers: [{ provide: NgbActiveModal, useValue: activeModal }],
    }).compileComponents()

    fixture = TestBed.createComponent(MergeProgressDialogComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('maps workflow phases to 3 step states and auto-closes on completion', () => {
    const subject = new BehaviorSubject<MergeWorkflowState>({
      phase: 'merging',
      progress: 20,
      sourceCount: 2,
      deleteOriginals: false,
    })

    const handle: MergeWorkflowHandle = {
      state$: subject.asObservable(),
      continueInBackground: jest.fn(),
      cancelTracking: jest.fn(),
    }

    component.attach(handle)
    expect(component.getStepStatus(0)).toBe('active')
    expect(component.getStepStatus(1)).toBe('pending')
    expect(component.getStepStatus(2)).toBe('pending')

    subject.next({
      phase: 'ocr',
      progress: 55,
      sourceCount: 2,
      deleteOriginals: false,
    })
    expect(component.getStepStatus(0)).toBe('done')
    expect(component.getStepStatus(1)).toBe('active')
    expect(component.getStepStatus(2)).toBe('pending')

    subject.next({
      phase: 'completed',
      progress: 100,
      sourceCount: 2,
      deleteOriginals: false,
      documentId: 55,
    })
    expect(activeModal.close).toHaveBeenCalledWith(55)
  })

  it('delegates continueInBackground and dismisses modal', () => {
    const subject = new BehaviorSubject<MergeWorkflowState>({
      phase: 'merging',
      progress: 20,
      sourceCount: 2,
      deleteOriginals: false,
    })
    const continueInBackground = jest.fn()
    component.attach({
      state$: subject.asObservable(),
      continueInBackground,
      cancelTracking: jest.fn(),
    })

    component.continueInBackground()
    expect(continueInBackground).toHaveBeenCalled()
    expect(activeModal.dismiss).toHaveBeenCalledWith('background')
  })
})
