import {
  Bars,
  Bookmark,
  ChevronsLeft,
  ChevronsRight,
  Comment,
  Microphone,
  Person,
  Plus,
} from '@gravity-ui/icons'
import { Button, Drawer } from '@heroui/react'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { useAccount } from '@/account'
import type { ConversationSummary } from '@/conversation-types'
import { useIsMobile } from '@/use-is-mobile'

type MainSidebarProps = {
  isCollapsed: boolean
  onCollapsedChange: (isCollapsed: boolean) => void
  conversations: ConversationSummary[]
  activeConversationId?: string
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
}

export function MainSidebar({
  isCollapsed,
  onCollapsedChange,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
}: MainSidebarProps) {
  const navigate = useNavigate()
  const { profile } = useAccount()
  const isMobile = useIsMobile()
  const [isMenuOpen, setMenuOpen] = useState(false)

  const openAccountPage = (to: '/listings' | '/profile') => {
    setMenuOpen(false)
    void navigate({ to: profile ? to : '/login' })
  }

  if (isCollapsed && !isMobile) {
    return (
      <Button
        isIconOnly
        variant="secondary"
        className="sidebar-expand-button"
        aria-label="Show sidebar"
        onPress={() => onCollapsedChange(false)}
      >
        <ChevronsRight aria-hidden="true" />
      </Button>
    )
  }

  const navigation = (
    <>
      <nav className="main-sidebar-nav">
        <div className="main-sidebar-heading">
          <span className="main-sidebar-label">Workspace</span>
          {!isMobile ? (
            <Button
              isIconOnly
              variant="ghost"
              className="sidebar-collapse-button"
              aria-label="Hide sidebar"
              onPress={() => onCollapsedChange(true)}
            >
              <ChevronsLeft aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <Button
          className="sidebar-link is-active"
          variant="ghost"
          aria-current="page"
          aria-label="Assistant"
          onPress={() => {
            setMenuOpen(false)
            void navigate({ to: '/' })
          }}
        >
          <span className="sidebar-link-icon">
            <Microphone aria-hidden="true" />
          </span>
          <span>Assistant</span>
        </Button>
        <Button
          className="sidebar-link"
          variant="ghost"
          aria-label="Saved listings"
          onPress={() => openAccountPage('/listings')}
        >
          <span className="sidebar-link-icon">
            <Bookmark aria-hidden="true" />
          </span>
          <span>Saved listings</span>
        </Button>
        <Button
          className="sidebar-link"
          variant="ghost"
          aria-label="Profile and settings"
          onPress={() => openAccountPage('/profile')}
        >
          <span className="sidebar-link-icon">
            <Person aria-hidden="true" />
          </span>
          <span>Profile & settings</span>
        </Button>

        <div className="sidebar-sessions-heading">
          <span className="main-sidebar-label">Sessions</span>
          <Button
            isIconOnly
            variant="ghost"
            className="sidebar-new-session"
            aria-label="Reset and start a new thread"
            title="New thread"
            onPress={() => {
              setMenuOpen(false)
              onNewConversation()
            }}
          >
            <Plus aria-hidden="true" />
          </Button>
        </div>
        <div className="sidebar-sessions" aria-label="Previous conversations">
          {conversations.map((conversation) => (
            <Button
              key={conversation.id}
              className={`sidebar-session${conversation.id === activeConversationId ? ' is-active' : ''}`}
              variant="ghost"
              aria-label={conversation.title}
              aria-current={conversation.id === activeConversationId ? 'true' : undefined}
              onPress={() => {
                setMenuOpen(false)
                onSelectConversation(conversation.id)
              }}
            >
              <Comment aria-hidden="true" />
              <span>{conversation.title}</span>
            </Button>
          ))}
        </div>
      </nav>

      <div className="sidebar-note">
        <span className="sidebar-note-dot" aria-hidden="true" />
        <div>
          <strong>Live shopping</strong>
          <span>Ask naturally to start researching.</span>
        </div>
      </div>
    </>
  )

  if (isMobile) {
    return (
      <Drawer isOpen={isMenuOpen} onOpenChange={setMenuOpen}>
        <Drawer.Trigger className="mobile-workspace-trigger" aria-label="Open workspace navigation">
          <Bars aria-hidden="true" /> <span>Workspace</span>
        </Drawer.Trigger>
        <Drawer.Backdrop>
          <Drawer.Content placement="bottom">
            <Drawer.Dialog className="workspace-drawer">
              <Drawer.Handle />
              <Drawer.Header>
                <Drawer.Heading>Your workspace</Drawer.Heading>
                <Drawer.CloseTrigger aria-label="Close workspace navigation" />
              </Drawer.Header>
              <Drawer.Body>{navigation}</Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    )
  }
  return (
    <aside className="main-sidebar" aria-label="Main navigation">
      {navigation}
    </aside>
  )
}
