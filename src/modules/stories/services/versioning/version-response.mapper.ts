import { User } from '@modules/users/entities'

import { VersionResponseDto, VersionUserDto } from '../../dto/version/version-response.dto'
import { StoryVersion } from '../../entities/story-version.entity'

const UNKNOWN_AUTHOR: VersionUserDto = {
  id: 'unknown',
  email: 'unknown@kuybi.dev',
  firstName: 'Unknown',
  lastName: 'User'
}

function toVersionUserDto(user?: User): VersionUserDto {
  if (!user) return UNKNOWN_AUTHOR
  const [firstName = '', ...rest] = user.name.split(' ')
  return { id: user.id, email: user.email, firstName, lastName: rest.join(' ') }
}

export function toVersionResponseDto(
  version: StoryVersion & { author?: User }
): VersionResponseDto {
  return {
    id: version.id,
    storyId: version.storyId,
    versionNumber: version.versionNumber,
    versionLabel: version.versionLabel,
    versionType: version.versionType,
    status: version.status,
    branchName: version.branchName,
    tag: version.tag,
    changesCount: version.changesCount,
    changeSummary: version.changeSummary,
    createdBy: toVersionUserDto(version.author),
    createdAt: version.createdAt,
    commitMessage: version.commitMessage,
    isPinned: version.isPinned,
    expiresAt: version.expiresAt
  }
}
